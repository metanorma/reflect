/**
 * Design tokens and layout constants — typed views over the generated
 * `design-tokens.json` (extracted verbatim from the mock).
 *
 * The mock remains the source of truth until superseded by the
 * implementation; regenerate the JSON with
 * `yarn workspace @metanorma/panel-layout tokens:extract`.
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */

import raw from './mock/design-tokens.json';


export interface LayoutConstants {
  /** Floor for one tabset (header + a sliver). B4. */
  readonly MIN_TS_H: number;
  /** Floor for a float window (overlay minimum). B5. */
  readonly MIN_WIN_H: number;
  /** Width floor for corner-resize drags. B5. */
  readonly windowMinWidth: number;
  /** titlebar(24) + borders(2) — chrome added when minting a solo window. */
  readonly undockChrome: number;
  /** Sash height inside a float window. HP4. */
  readonly sashSize: number;
  /** Fallback window size for panel undock (FlexLayout reference). */
  readonly WRAP_W: number;
  readonly WRAP_H: number;
}

export interface StorageKeys {
  readonly layout: string;
  readonly heights: string;
}

export interface DndEdges {
  readonly size: { value: number; type: string };
  readonly activationSize: { value: number; type: string };
}

export interface FloatingGroupBounds {
  readonly minimumHeightWithinViewport: number;
  readonly minimumWidthWithinViewport: number;
}

export interface Provenance {
  readonly source: string;
  readonly commit: string;
  readonly commitDate: string | null;
  readonly workingTreeDirtyAtExtraction: boolean;
  readonly extractedAtUTC: string;
  readonly regenerate: string;
  readonly note: string;
}

interface DesignTokensFile {
  readonly _provenance: Provenance;
  readonly tokens: Record<string, string>;
  readonly dvTokens: Record<string, string>;
  readonly constants: LayoutConstants;
  readonly dndEdges: DndEdges;
  readonly floatingGroupBounds: FloatingGroupBounds;
  readonly storageKeys: StorageKeys;
  readonly panelTitles: Record<string, string>;
  readonly presetLayout: unknown;
  readonly importMap: unknown;
}


const file = raw as DesignTokensFile;

/** Mock `:root` custom properties, verbatim (e.g. `--accent`). */
export const TOKENS = file.tokens;

/** Dockview theme overrides, verbatim (titlebar/tab/sash chrome values). */
export const DV_TOKENS = file.dvTokens;

/** Layout behavior constants (floors, chrome, sash, fallbacks). */
export const CONSTANTS = file.constants;

/** Dockview `dndEdges` option, verbatim from the mock. */
export const DND_EDGES = file.dndEdges;

/** Dockview `floatingGroupBounds` option — 0/0 disables the stock clamp. */
export const FLOATING_GROUP_BOUNDS = file.floatingGroupBounds;

/**
 * Default localStorage key names (consumer-configurable; the storage medium
 * itself is injected — see persistence.ts). behavior.spec.md §4.
 */
export const STORAGE_KEYS = file.storageKeys;

/** Provenance of the extraction (mock path, commit, date). */
export const PROVENANCE = file._provenance;
