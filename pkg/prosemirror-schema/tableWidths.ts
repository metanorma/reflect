/**
 * Table column-width parsing and normalization (schema.spec.md §8.5).
 *
 * The `table` node's `colwidths` attribute stores one percentage string per
 * **grid** column (`null` = autowidth — the two-mode model). This module owns
 * the read-side policy shared by every ingestion path (HTML `parseDOM`,
 * clipboard, JSON load): grid-count alignment, sum tolerance, and repair.
 *
 * The DOM layer is intentionally thin: `parseColWidths` accepts the two
 * physical sources (a `data-colwidths` attribute on the `<table>` element, or
 * a child `<colgroup>`'s `<col>` elements) through a minimal structural
 * interface so the repair logic stays pure and headless-testable.
 */

/** Attribute name carrying the intra-editor clipboard encoding. */
export const DATA_COLWIDTHS_ATTR = 'data-colwidths';

/**
 * Read-side sum tolerance, in percentage points. Values within this distance
 * of 100 are accepted verbatim — pipeline output legitimately rounds (e.g.
 * six columns at 16.67% sum to 100.02), and imported values are never
 * rewritten unless structurally unrecoverable.
 */
export const WIDTHS_SUM_TOLERANCE = 0.5;

/**
 * Minimal structural shape of a `<colgroup>` read for widths. `colgroup` and
 * `col` need not be real DOM elements — tests feed plain objects — but the
 * production path passes live elements from `parseDOM.getAttrs`.
 */
export interface ColgroupLike {
  /** Width declarations of the `<col>` children, in document order. */
  readonly colWidths: readonly string[];
}

/**
 * Extract a `width` declaration from a `<col>` element's inline style.
 *
 * Accepts only percentage values (`width:16.67%`); non-percentage
 * declarations (`px`, `em`, `auto`) are ignored — the editor's model is
 * percentage-only, and a foreign px value carries no proportional meaning.
 */
function styleWidth(col: { readonly style?: { readonly width?: string } }): string | null {
  const w = col.style?.width;
  if (typeof w !== 'string') return null;
  return w.trim().endsWith('%') ? w.trim() : null;
}

/**
 * Parse a percentage string (`"16.67%"`, `"16.67"`, `" 16.67 % "`) into a
 * number, or `null` when the string is not a positive percentage.
 */
export function parsePct(s: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*%?\s*$/.exec(s);
  if (m === null) return null;
  const n = Number(m[1]);
  return n > 0 ? n : null;
}

/**
 * Normalize a repaired width list to the write-side canonical form: exactly
 * `cols` entries, each rounded to two decimals, summing to exactly 100 with
 * the **last** column absorbing the rounding residual.
 *
 * Input must be positive, finite numbers; caller (parseColWidths or a
 * command) guarantees that.
 */
export function normalizeWidths(pcts: readonly number[], cols: number): string[] {
  const vals = pcts.slice(0, cols).map((n) => Math.round(n * 100) / 100);
  while (vals.length < cols) vals.push(0);
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) return equalWidths(cols);
  // Scale to 100 then round; the residual lands on the last column so the
  // emitted strings always sum to exactly 100.00.
  const scaled = vals.map((n) => Math.round((n / sum) * 10000) / 100);
  const scaledSum = scaled.reduce((a, b) => a + b, 0);
  const last = scaled.pop() ?? 0;
  scaled.push(Math.round((last + (100 - scaledSum)) * 100) / 100);
  return scaled.map((n) => `${n.toFixed(2)}%`);
}

/** `cols` equal entries summing to exactly 100 (`["50.00%", "50.00%"]`). */
export function equalWidths(cols: number): string[] {
  if (cols <= 0) return [];
  const base = Math.floor((100 / cols) * 100) / 100;
  const out = Array.from({ length: cols }, () => base);
  const lastIdx = cols - 1;
  out[lastIdx] = Math.round((100 - base * (cols - 1)) * 100) / 100;
  return out.map((n) => `${n.toFixed(2)}%`);
}

/**
 * Repair an ingested width list against the grid column count:
 *
 * 1. Pad with equal shares when entries are missing; drop extras.
 * 2. If `|Σ − 100| ≤ {@link WIDTHS_SUM_TOLERANCE}`, keep the values
 *    **verbatim** — imported values are never rewritten inside tolerance.
 * 3. Otherwise renormalize proportionally (write-side canonical form).
 * 4. Empty / non-positive lists → `null` (autowidth).
 *
 * Returns the canonical attr value: a `string[]` or `null`.
 */
export function repairColWidths(
  pcts: readonly number[],
  cols: number,
): readonly string[] | null {
  if (cols <= 0) return null;
  const positive = pcts.filter((n) => Number.isFinite(n) && n > 0);
  if (positive.length === 0) return null;
  // Grid-count alignment first …
  if (positive.length < cols) {
    const missing = cols - positive.length;
    const knownSum = positive.reduce((a, b) => a + b, 0);
    // Known entries keep their values; missing entries split the space the
    // known ones do NOT claim, equally. Degenerate input (known entries
    // already ≥ 100) has no sensible proportional reading — equal widths.
    if (knownSum >= 100) return equalWidths(cols);
    const share = (100 - knownSum) / missing;
    return normalizeWidths(
      [...positive, ...Array.from({ length: missing }, () => share)],
      cols,
    );
  }
  if (positive.length > cols) {
    return normalizeWidths(positive.slice(0, cols), cols);
  }
  // … then the tolerance rule.
  const sum = positive.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) <= WIDTHS_SUM_TOLERANCE) {
    // Verbatim, but canonicalized to the `"N.NN%"` string form so attr
    // equality checks (e2e, clipboard round-trip) are string-stable.
    return positive.map((n) => `${n.toFixed(2)}%`);
  }
  return normalizeWidths(positive, cols);
}

/**
 * Read column widths from the two ingestion sources, in precedence order:
 *
 * 1. `data-colwidths` attribute on the `<table>` element — the intra-editor
 *    clipboard encoding (written by the editor's clipboard serializer), a
 *    JSON array of percentage strings. Same mechanism ProseMirror's
 *    `data-pm-slice` relies on for structure.
 * 2. Child `<colgroup>`'s `<col>` elements — both the conforming inline-style
 *    form (`<col style="width:16.67%">`, which the editor renders) and the
 *    legacy attribute form (`<col width="16.67%">`, pipeline HTML).
 *
 * `colCount` is the table's grid column count (max Σ colspan across all rows
 * of all row groups); widths are repaired against it. Returns the attr value
 * (`string[]` with one entry per grid column) or `null` (autowidth / no
 * widths found / unrecoverable input).
 */
export function parseColWidths(
  table: {
    readonly getAttribute?: (name: string) => string | null;
    readonly querySelectorAll?: (
      sel: string,
    ) => NodeLikeList | readonly ColLike[];
  },
  colCount: number,
): readonly string[] | null {
  if (colCount <= 0) return null;

  // Source 1: data-colwidths JSON.
  const raw = table.getAttribute?.(DATA_COLWIDTHS_ATTR) ?? null;
  if (raw !== null && raw !== '') {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const nums = parsed
          .filter((e): e is string => typeof e === 'string')
          .map(parsePct)
          .filter((n): n is number => n !== null);
        const repaired = repairColWidths(nums, colCount);
        if (repaired !== null) return repaired;
      }
    } catch {
      // Malformed JSON falls through to the colgroup source.
    }
  }

  // Source 2: colgroup <col> elements (style form first, attribute form
  // second — a single <col> carrying both is a foreign-authoring artifact;
  // style wins per the conforming-form-first policy).
  const cols = table.querySelectorAll?.('colgroup > col')
    ? Array.from(table.querySelectorAll('colgroup > col') as NodeLikeList)
    : [];
  const raws: string[] = [];
  for (const col of cols) {
    const s = styleWidth(col);
    if (s !== null) {
      raws.push(s);
      continue;
    }
    const a = col.getAttribute?.('width') ?? null;
    if (a !== null && a.trim() !== '') raws.push(a.trim());
  }
  if (raws.length === 0) return null;
  return repairColWidths(raws.map(parsePct).filter((n): n is number => n !== null), colCount);
}

/** Structural type of a `<col>` read for widths (DOM element or test double). */
export interface ColLike {
  readonly style?: { readonly width?: string };
  readonly getAttribute?: (name: string) => string | null;
}

/** A DOM `NodeList`-shaped result of `querySelectorAll` (read-only). */
export interface NodeLikeList {
  readonly length: number;
  item(index: number): ColLike | null;
  [index: number]: ColLike;
  forEach(cb: (col: ColLike, index: number) => void): void;
  [Symbol.iterator](): IterableIterator<ColLike>;
}
