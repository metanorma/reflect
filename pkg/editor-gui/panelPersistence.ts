/**
 * editor-gui's layout-persistence configuration — the envelope format
 * under editor-gui's OWN key namespace (integration ruling; the demo's
 * two-key legacy strings are demo consumer config, never reused here).
 *
 * The envelope (api.spec.md §2.6, the library default) stores layout +
 * heights as one versioned payload under the single key; both halves
 * decode independently, and a corrupt envelope silently falls back to
 * `defaultLayout` (= the preset).
 */

import type { PersistenceOptions } from '@metanorma/panel-layout';
import { presetLayout } from './presetLayout.js';

/** editor-gui's localStorage key for the persisted layout envelope. */
export const LAYOUT_STORAGE_KEY = 'mn-editor-gui-layout-v1';

/**
 * The `<PanelLayout persistence={...}>` options. `onFallback` is optional
 * (exactOptionalPropertyTypes: only set when provided) — App wires it to
 * the status line.
 */
export function layoutPersistence(
  onFallback?: PersistenceOptions['onFallback'],
): PersistenceOptions {
  return {
    defaultLayout: presetLayout(),
    format: { kind: 'envelope', key: LAYOUT_STORAGE_KEY },
    ...(onFallback !== undefined ? { onFallback } : {}),
  };
}
