/**
 * Image sizing/mimetype normalization and serialization (§17.8).
 *
 * The `tableWidths.ts` pattern: a pure, headless-testable read-side policy
 * shared by every ingestion boundary (HTML `parseDOM`, clipboard, JSON
 * load). Grammar facts are pinned in
 * [`docs/metanorma-model.md`](../../docs/metanorma-model.md) §4: the image
 * size slots carry `ImageSize` = decimal, percent, or the literal `"auto"`;
 * the figure size slots are free text; the page-relative keywords'
 * conformant home is `figure/@width`.
 *
 * Canonical storage (§17.8 import table): a size attr holds a positive
 * number (px) or a `` `${number}%` `` percent string — never the string
 * `"auto"` (that is what `null` means) and never a suffixed string. Only
 * non-canonical foreign values are banked verbatim in `data`, by the
 * callers of {@link normalizeImageSize} — this module never touches `data`.
 */

/**
 * A canonical size value: positive number (CSS px) or percent string
 * (`` `${number}%` `` — always with a number, never a bare `"%"`).
 */
export type ImageSizeValue = number | `${number}%`;

/** The not-determined mimetype marker (§17.4) — a real MIME constant, so the
 * upstream required-attr shape is satisfied even when it exports verbatim;
 * the one stored value export-time inference may replace. */
export const UNKNOWN_MIMETYPE = 'application/octet-stream' as const;

/** Extension → MIME map for `inferMimetype`'s weakest source (§11). */
const EXT_MIME: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  tiff: 'image/tiff',
};

/**
 * Normalize one image dimension to the canonical value (§17.8 import table).
 *
 * `null`/`undefined`/`""`/`"auto"` → `null` (auto ≡ absent). `"150"` and
 * `"150px"` → `150`; `"4.3"` → `4.3`; `"50%"` (any surrounding/inner
 * whitespace) → `"50%"`. A non-positive number (`0`, `-5`, `"0%"`) → `null`
 * — the canonical domain is positive sizes. Anything else (`"10cm"`,
 * `"abc"`, `"text-width"`) → `null` **without banking**: distinguishing
 * garbage from `auto` (so the caller can bank the original in `data`) is the
 * caller's job — {@link isForeignSizeValue} is that test.
 */
export function normalizeImageSize(raw: unknown): ImageSizeValue | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/\s+/g, '');
  if (s === '' || s === 'auto') return null;
  const m = /^(\d+(?:\.\d+)?)(px|%)?$/.exec(s);
  if (m === null) return null;
  const digits = m[1];
  if (digits === undefined) return null;
  const n = Number(digits);
  if (!(n > 0)) return null;
  return m[2] === '%' ? (`${n}%` as `${number}%`) : n;
}

/**
 * Whether a raw value is a foreign (non-canonical) size string the caller
 * should bank verbatim in `data.width`/`data.height` (§17.8): a non-empty
 * string that is neither `auto` (case-insensitive, whitespace-tolerant) nor
 * normalizable. Numbers and `null`/`undefined` are never foreign.
 */
export function isForeignSizeValue(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const s = raw.replace(/\s+/g, '');
  if (s === '' || s.toLowerCase() === 'auto') return false;
  return normalizeImageSize(raw) === null;
}

/**
 * Normalize a figure-width value to the page-relative role keyword (§17.8):
 * `"text-width"` / `"full-page-width"` (whitespace-tolerant), else `null`.
 * Numeric and other non-keyword values are foreign to the role slot — the
 * caller banks them in the figure's `data.width` (free-text slot, §17.5).
 */
export function normalizeFigureWidth(
  raw: unknown,
): 'text-width' | 'full-page-width' | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  return s === 'text-width' || s === 'full-page-width' ? s : null;
}

/**
 * Infer an image mimetype (§17.4). **Total — never returns `null`**: source
 * order is (1) a provided Blob `type` (`fileType`), (2) a `data:`-URL MIME
 * prefix (a `image/*` wildcard is skipped — it is standoc's placeholder for
 * a sniffed type, not a real MIME), (3) the extension map, (4) the
 * {@link UNKNOWN_MIMETYPE} marker. For URL-inserted images (no `fileType`,
 * no `data:` prefix) this is therefore the extension map or the marker —
 * exactly the low-confidence population §17.4 names for export-time
 * revisiting.
 */
export function inferMimetype(source: string, fileType?: string | null): string {
  if (typeof fileType === 'string' && fileType.trim() !== '') {
    return fileType.trim();
  }
  if (typeof source === 'string' && source !== '') {
    const data = /^data:([^;,]+)/i.exec(source);
    if (data !== null) {
      const mime = (data[1] ?? '').trim().toLowerCase();
      if (mime.includes('/') && mime !== 'image/*') return mime;
    }
    const path = source.split(/[?#]/, 1)[0] ?? '';
    const ext = /\.([a-z0-9]+)$/i.exec(path);
    if (ext !== null) {
      const hit = EXT_MIME[ext[1]?.toLowerCase() ?? ''];
      if (hit !== undefined) return hit;
    }
  }
  return UNKNOWN_MIMETYPE;
}

/**
 * `ImageSize`-conformant plain-decimal serialization of a positive finite
 * number at **any** magnitude (§17.8 export contract). In this repo the sole
 * consumer is `toDOM`'s `data-width`/`data-height`; the export-contract
 * wording names the not-yet-written Semantic-XML converter as the other,
 * future consumer. Raw `String(number)` is not acceptable: it goes
 * exponential at `1e21` (and for tiny fractions), which leaves the
 * `\d+([.]\d+)?(%?)` grammar — hence the BigInt / digit-shift expansion.
 *
 * @throws {RangeError} for a non-number, non-finite, or non-positive input.
 */
export function formatImageSize(v: number): string {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) {
    throw new RangeError(
      `formatImageSize: expected a positive finite number, got ${String(v)}`,
    );
  }
  if (Number.isInteger(v)) {
    // BigInt(double) is exact for integer-valued doubles and never
    // exponential — plain decimal for any magnitude.
    return BigInt(v).toString();
  }
  const s = v.toString();
  if (!s.includes('e')) return s;
  // Expand exponential notation by shifting the decimal point across the
  // mantissa digits — a faithful plain-decimal rendering.
  const m = /^(\d+)(?:\.(\d+))?e([+-]\d+)$/i.exec(s);
  if (m === null) return s; // unreachable for finite toString() output
  const int = m[1] ?? '';
  const frac = m[2] ?? '';
  const exp = Number(m[3]);
  const digits = int + frac;
  const pos = int.length + exp;
  let out: string;
  if (pos <= 0) {
    out = `0.${'0'.repeat(-pos)}${digits}`;
  } else if (pos >= digits.length) {
    out = digits + '0'.repeat(pos - digits.length);
  } else {
    out = `${digits.slice(0, pos)}.${digits.slice(pos)}`;
  }
  // Trailing fraction zeros are artifacts of the shift.
  return out.includes('.') ? out.replace(/0+$/, '').replace(/\.$/, '') : out;
}

/**
 * Grammar-faithful `ImageSize` conformance (§17.8 banked-original gate):
 * `true` for a decimal string, a percent string, **or the literal
 * `"auto"`** — the grammar admits all three — and for a positive finite
 * number (typed canonical form). Whitespace-tolerant on strings. The export
 * contract, not this predicate, decides that a banked `"auto"` is pointless
 * to re-emit (typed `null` already means `auto` through omission). The
 * figure-width gate needs no predicate — the figure slots are grammar
 * `text`, everything conforms.
 */
export function isImageSizeConformant(raw: unknown): boolean {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0;
  if (typeof raw !== 'string') return false;
  const s = raw.replace(/\s+/g, '');
  if (s === 'auto') return true;
  return /^\d+(\.\d+)?%?$/.test(s);
}

/**
 * Assert the single-node image attribute shape (§6.1). Deliberately narrow:
 * **no role logic** (the role⇔size exclusion is cross-node — a command-level
 * invariant of `updateImageAttrs`, §17.8) and **no non-null mimetype
 * requirement** (that is an insertion-path precondition of
 * `insertImageIntoFigure`, satisfied by construction because
 * `inferMimetype` is total; legacy/imported documents may legitimately
 * carry `null`). An absent (`undefined`) optional key is treated as `null`.
 *
 * - `src` — non-empty string.
 * - `mimetype` — string or `null`.
 * - `width`/`height` — positive finite number, positive percent string
 *   (`` `${n}%` `` — the canonical form `normalizeImageSize` produces), or
 *   `null`.
 *
 * @throws {Error} naming the first failing field.
 */
export function assertValidImageAttrs(attrs: {
  src?: unknown;
  mimetype?: unknown;
  width?: unknown;
  height?: unknown;
}): asserts attrs is {
  src: string;
  mimetype: string | null;
  width: ImageSizeValue | null;
  height: ImageSizeValue | null;
} {
  if (typeof attrs.src !== 'string' || attrs.src === '') {
    throw new Error(
      "assertValidImageAttrs: 'src' must be a non-empty string.",
    );
  }
  const mimetype = attrs.mimetype ?? null;
  if (mimetype !== null && typeof mimetype !== 'string') {
    throw new Error(
      "assertValidImageAttrs: 'mimetype' must be a string or null.",
    );
  }
  for (const key of ['width', 'height'] as const) {
    const value = attrs[key] ?? null;
    if (value === null) continue;
    const ok =
      typeof value === 'number'
        ? Number.isFinite(value) && value > 0
        : typeof value === 'string' &&
          /^(\d+(?:\.\d+)?)%$/.test(value) &&
          Number(value.slice(0, -1)) > 0;
    if (!ok) {
      throw new Error(
        `assertValidImageAttrs: '${key}' must be a positive finite number, ` +
          'a positive percent string, or null.',
      );
    }
  }
}
