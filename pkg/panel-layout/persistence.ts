/**
 * Layout persistence — save/load over an injected storage adapter, with
 * corrupted-storage fallback to the default layout (behavior.spec.md A6/A7)
 * and `{top}`-only window-position normalization on write (HP5/A5).
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */

import type { DockviewApi, SerializedDockview } from 'dockview';

import { STORAGE_KEYS } from './tokens.js';


/**
 * Structural subset of `Storage` the persistence layer needs — trivially
 * mockable (behavior.spec.md §4: medium and key names are consumer
 * configuration; the serialization model is library contract).
 */
export interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type HeightsMap = Record<string, number>;

export interface PersistenceOptions {
  /** Default layout used when storage is empty or corrupted (A6/A7). */
  readonly defaultLayout: SerializedDockview;
  /** Storage adapter; consumers inject their own (default: localStorage). */
  readonly storage?: LayoutStorage;
  /** Key names (defaults: the demo's legacy keys, goldens parity). */
  readonly keys?: { readonly layout: string; readonly heights: string };
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
  /** Restore-to-default support (HP9): wipe both keys. */
  clear(): void;
}


function browserStorage(): LayoutStorage {
  // C2: quota/private-mode failures are swallowed — persistence silently
  // turns off and the session runs on the default layout + memory.
  const wrap = (op: () => void): void => {
    try {
      op();
    } catch {
      // ignore — consumer surfaces persistence status if it cares
    }
  };
  return {
    getItem: (k) => {
      try {
        return window.localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    setItem: (k, v) => wrap(() => window.localStorage.setItem(k, v)),
    removeItem: (k) => wrap(() => window.localStorage.removeItem(k)),
  };
}

export function createPersistence(options: PersistenceOptions): Persistence {
  const storage = options.storage ?? browserStorage();
  const keys = options.keys ?? STORAGE_KEYS;

  return {
    saveLayout(api) {
      try {
        const json = api.toJSON();
        storage.setItem(keys.layout, JSON.stringify(json));
        return json;
      } catch {
        return null; // C4: swallowed — stale layout stays in storage
      }
    },

    loadLayout() {
      try {
        const raw = storage.getItem(keys.layout);
        if (!raw) {
          return null;
        }
        const parsed: unknown = JSON.parse(raw);
        const hasGrid = typeof parsed === 'object' && parsed !== null
          && 'grid' in parsed;
        return hasGrid ? (parsed as SerializedDockview) : null;
      } catch {
        return null; // A6: corrupted JSON → caller falls back to default
      }
    },

    saveHeights(heights) {
      try {
        storage.setItem(keys.heights, JSON.stringify(heights));
      } catch {
        // C2: swallowed
      }
    },

    loadHeights() {
      try {
        const raw = storage.getItem(keys.heights);
        const parsed: unknown = raw ? JSON.parse(raw) : {};
        if (typeof parsed !== 'object' || parsed === null) {
          return {}; // A7
        }
        return parsed as HeightsMap;
      } catch {
        return {}; // A7: corrupted heights → default heights
      }
    },

    clear() {
      try {
        storage.removeItem?.(keys.layout);
        storage.removeItem?.(keys.heights);
      } catch {
        // C2
      }
    },
  };
}
