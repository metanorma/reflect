/**
 * Layout persistence — save/load over one injected storage adapter
 * (api.spec.md §2.6), with corrupted-storage fallback to the default
 * layout (behavior.spec.md A6/A7) and a once-per-session
 * storage-failure signal (C2).
 *
 * Two storage formats, one adapter, per-half independent decode:
 *
 * - `envelope` (the default) — one `PersistedState {version, layout,
 *   heights}` object under one key (`mn-panel-layout-v1`); a version
 *   mismatch falls back on the whole envelope.
 * - `two-key` (the mock's storage shape) — the layout and the heights
 *   maps live under two independent keys; each half decodes on its own,
 *   so A6/A7 corruption semantics hold per half.
 *
 * The fallback signal shape (`reason: layout-corrupt | heights-corrupt |
 * layout-restore-threw | storage-unavailable`) mirrors api.spec.md §2.2 —
 * the future `PanelLayout` component relays these verbatim as
 * `PanelLayoutFallbackEvent`s. This module emits the first two (loads)
 * and `storage-unavailable` (first write failure, once); the component
 * owns `layout-restore-threw` (A9, the fromJSON net).
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */

import type { DockviewApi, SerializedDockview } from 'dockview';

/** §2.6 default envelope key (the two-key format carries its own keys). */
export const DEFAULT_ENVELOPE_KEY = 'mn-panel-layout-v1';

/** Current envelope schema version. */
export const ENVELOPE_VERSION = 1;


/**
 * Structural subset of `Storage` the persistence layer needs — trivially
 * mockable (behavior.spec.md §4: medium and key names are consumer
 * configuration; the serialization model is library contract). One
 * adapter, never two — `clear()` stays atomic (HP9). Every member is
 * required: `clear()` wipes the keys through `removeItem` (HP9's
 * keys-removed step) — a load-only adapter must still implement it
 * (a no-op body is fine).
 */
export interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  /** Wiped by `clear()` (HP9); load-only adapters may no-op it. */
  removeItem(key: string): void;
}

export type HeightsMap = Record<string, number>;

/** api.spec.md §2.6 — the envelope payload (`version: 1`). */
export interface PersistedState {
  readonly version: 1;
  readonly layout: SerializedDockview;
  /**
   * Keyed by dockview group id; stale ids dropped on rebuild (A8 — the
   * pin pass's job, not this module's).
   */
  readonly heights: HeightsMap;
}

/** api.spec.md §2.6 — `two-key` pins the mock's storage shape. */
export type StorageFormat =
  | { readonly kind: 'envelope'; readonly key: string }
  | { readonly kind: 'two-key'; readonly keys: {
      readonly layout: string; readonly heights: string } };

/**
 * api.spec.md §2.2 reason union, spelled here so the future `PanelLayout`
 * can relay these events without re-mapping. Only the three reasons this
 * module can produce are ever emitted.
 */
export type FallbackReason =
  | 'layout-corrupt'
  | 'heights-corrupt'
  | 'layout-restore-threw'
  | 'storage-unavailable';

/** api.spec.md §2.2 shape (the component re-wraps it verbatim). */
export interface FallbackEvent {
  readonly reason: FallbackReason;
  readonly message?: string;
}

export interface PersistenceOptions {
  /** Default layout used when storage is empty or corrupted (A6/A7). */
  readonly defaultLayout: SerializedDockview;
  /** Storage adapter; consumers inject their own (default: localStorage). */
  readonly storage?: LayoutStorage;
  /**
   * Storage format (§2.6); default `{kind:'envelope', key:
   * 'mn-panel-layout-v1'}`. `two-key` is first-class — the demo and
   * parity suite pin it, keeping the mock's exact key strings.
   */
  readonly format?: StorageFormat;
  /**
   * Corrupted-storage / storage-failure signal (§2.2) — a low-frequency
   * channel: each distinct corrupted payload signals once per storage
   * key, however many loads read it; changed storage re-signals. Loads
   * emit per-half `*-corrupt`; the first write failure emits
   * `storage-unavailable` once per session (C2). Callback throws are
   * swallowed.
   */
  readonly onFallback?: (event: FallbackEvent) => void;
}

export interface Persistence {
  /** Serialize + persist the current layout. Returns null on failure. */
  saveLayout(api: DockviewApi): SerializedDockview | null;
  /**
   * Load the persisted layout; null when absent/corrupted (callers fall
   * back to the default layout — A6/A7 silent-fallback semantics).
   */
  loadLayout(): SerializedDockview | null;
  saveHeights(heights: HeightsMap): void;
  loadHeights(): HeightsMap;
  /** Restore-to-default support (HP9): wipe persisted state. */
  clear(): void;
}


/* ---- decode seam -------------------------------------------------------
   Hand-rolled guards (§2.6: dockview's `SerializedDockview` carries no
   version or migration story — versioning is the library's). The seam's
   internals can be replaced by a schema decoder without API change. */

/** Mock :670 — `return j.grid ? j : null` (truthiness, not presence). */
function isLayoutShape(value: unknown): value is SerializedDockview {
  if (typeof value !== 'object' || value === null) return false;
  return Boolean((value as { grid?: unknown }).grid);
}

/** Mock :921 — an object of group-id → finite number (arrays are not maps). */
function isHeightsShape(value: unknown): value is HeightsMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  for (const h of Object.values(value)) {
    if (typeof h !== 'number' || !Number.isFinite(h)) return false;
  }
  return true;
}

interface DecodedHalves {
  /** null = fall back to default (absent OR corrupt — caller cannot tell). */
  readonly layout: SerializedDockview | null;
  readonly heights: HeightsMap | null;
}

/** Decode a raw two-key half (the two decode sites). */
function decodeHalf(
  raw: string | null,
  guard: (v: unknown) => boolean,
): unknown | null {
  if (raw === null) return null; // absent — not a fallback (HP1 silence)
  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Decode a raw envelope (§2.6): version gate first, then both halves. */
function decodeEnvelope(raw: string | null): DecodedHalves | null {
  if (raw === null) return null; // absent — not a fallback (HP1 silence)
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { layout: null, heights: null };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { layout: null, heights: null };
  }
  // §2.6: a version mismatch (or a non-envelope payload) falls back on
  // the WHOLE envelope — both halves together.
  if ((parsed as { version?: unknown }).version !== ENVELOPE_VERSION) {
    return { layout: null, heights: null };
  }
  const layoutHalf = (parsed as { layout?: unknown }).layout;
  const heightsHalf = (parsed as { heights?: unknown }).heights;
  return {
    layout: layoutHalf !== undefined && isLayoutShape(layoutHalf)
      ? layoutHalf
      : null,
    heights: heightsHalf !== undefined && isHeightsShape(heightsHalf)
      ? heightsHalf
      : null,
  };
}


function browserStorage(): LayoutStorage {
  // C2: quota/private-mode failures must not reach callers — the adapter
  // surfaces them (storage MAY throw per DOM contract); the once-per-
  // session signal and the swallow live in createPersistence.
  return {
    getItem: (k) => window.localStorage.getItem(k),
    setItem: (k, v) => window.localStorage.setItem(k, v),
    removeItem: (k) => window.localStorage.removeItem(k),
  };
}


export function createPersistence(options: PersistenceOptions): Persistence {
  const storage = options.storage ?? browserStorage();
  const format: StorageFormat = options.format
    ?? { kind: 'envelope', key: DEFAULT_ENVELOPE_KEY };
  const keys = format.kind === 'envelope'
    ? { layout: format.key, heights: format.key }
    : format.keys;

  // Envelope-mode memory: the last-known-good halves. saveHeights before
  // any load/save writes the envelope, pairing the new heights with the
  // configured default layout — one envelope, never a partial write.
  let lastLayout: SerializedDockview = options.defaultLayout;
  let lastHeights: HeightsMap = {};

  const fallback = (reason: FallbackReason, message?: string): void => {
    if (!options.onFallback) return;
    try {
      options.onFallback({ reason, ...(message ? { message } : {}) });
    } catch {
      // swallowed — the consumer's callback must never break persistence
    }
  };

  // C2: `storage-unavailable` is reported ONCE, on the first write
  // failure (§2.2). Reads stay silent: a throwing read is
  // indistinguishable from absent storage, and the session must continue
  // on the default layout.
  let storageUnavailableSignaled = false;
  const write = (op: () => void): boolean => {
    try {
      op();
      return true;
    } catch (e) {
      if (!storageUnavailableSignaled) {
        storageUnavailableSignaled = true;
        fallback('storage-unavailable',
          e instanceof Error ? e.message : 'storage write failed');
      }
      return false;
    }
  };

  // Read one key; a throwing getItem reads as absent (C2: silent).
  const readRaw = (key: string): string | null => {
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };

  // §2.2 low-frequency discipline: one signal per distinct payload per
  // storage key, however many loads decode it (loadLayout and
  // loadHeights both decode the envelope's payload). Changed storage
  // (a new corruption state, a save, a clear) re-signals.
  const reported = new Map<string, string | null>();

  /**
   * Read + decode both halves of the configured format. Emits the
   * per-half `*-corrupt` signals (deduped). Envelope version mismatches
   * signal BOTH halves — the whole envelope fell back (§2.6).
   */
  const readState = (): DecodedHalves => {
    if (format.kind === 'two-key') {
      const rawLayout = readRaw(keys.layout);
      const rawHeights = readRaw(keys.heights);
      const layout = decodeHalf(rawLayout, isLayoutShape);
      const heights = decodeHalf(rawHeights, isHeightsShape);
      if (reported.get(keys.layout) !== rawLayout) {
        reported.set(keys.layout, rawLayout);
        if (rawLayout !== null && layout === null) {
          fallback('layout-corrupt', 'corrupted layout JSON');
        }
      }
      if (reported.get(keys.heights) !== rawHeights) {
        reported.set(keys.heights, rawHeights);
        if (rawHeights !== null && heights === null) {
          fallback('heights-corrupt', 'corrupted heights JSON');
        }
      }
      return { layout: layout as SerializedDockview | null,
        heights: heights as HeightsMap | null };
    }
    const raw = readRaw(format.key);
    const decoded = decodeEnvelope(raw);
    if (reported.get(format.key) !== raw) {
      reported.set(format.key, raw);
      // decoded === null = ABSENT (HP1 silence); a present-but-bad
      // envelope signals per its fallen halves — a version mismatch
      // fell both, so both reasons fire (§2.6 whole-envelope fallback).
      if (decoded !== null && decoded.layout === null) {
        fallback('layout-corrupt', 'corrupted layout JSON');
      }
      if (decoded !== null && decoded.heights === null) {
        fallback('heights-corrupt', 'corrupted heights JSON');
      }
    }
    return { layout: decoded?.layout ?? null, heights: decoded?.heights ?? null };
  };

  /** Envelope writes always carry both halves (§2.6: one object). */
  const writeEnvelope = (): boolean => write(() => {
    const state: PersistedState = {
      version: ENVELOPE_VERSION,
      layout: lastLayout,
      heights: lastHeights,
    };
    storage.setItem(format.kind === 'envelope' ? format.key : '',
      JSON.stringify(state));
  });

  return {
    saveLayout(api) {
      let json: SerializedDockview;
      try {
        json = api.toJSON();
      } catch {
        return null; // C4: swallowed — stale layout stays in storage
      }
      lastLayout = json;
      if (format.kind === 'envelope') {
        return writeEnvelope() ? json : null;
      }
      return write(() => {
        storage.setItem(keys.layout, JSON.stringify(json));
      }) ? json : null;
    },

    loadLayout() {
      const halves = readState();
      if (halves.layout !== null) lastLayout = halves.layout;
      if (halves.heights !== null) lastHeights = halves.heights;
      return halves.layout;
    },

    saveHeights(heights) {
      lastHeights = heights;
      if (format.kind === 'envelope') {
        writeEnvelope();
        return;
      }
      write(() => {
        storage.setItem(keys.heights, JSON.stringify(heights));
      });
    },

    loadHeights() {
      const halves = readState();
      if (halves.layout !== null) lastLayout = halves.layout;
      if (halves.heights !== null) lastHeights = halves.heights;
      return halves.heights ?? {};
    },

    clear() {
      // HP9 (mock reset): both keys wiped, memory reset to the default
      // layout + empty heights (`heightsMap = {}`).
      lastLayout = options.defaultLayout;
      lastHeights = {};
      const uniqueKeys = format.kind === 'envelope'
        ? [format.key]
        : [keys.layout, keys.heights];
      for (const key of uniqueKeys) {
        write(() => {
          storage.removeItem(key);
        });
      }
    },
  };
}
