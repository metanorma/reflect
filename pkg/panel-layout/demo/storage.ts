/**
 * Demo storage configuration — the demo consumer's own two-key format
 * (api.spec.md §2.6: "the two-key format (the mock's storage shape) is a
 * first-class option that the demo and parity suite pin, keeping goldens
 * byte-exact against both keys"; behavior.spec.md §4: the storage medium
 * and key names are CONSUMER configuration). The legacy key strings are
 * the mock's historical localStorage keys, verbatim — the parity goldens'
 * `storage` halves and the flows' `settle()` polling read them by name.
 *
 * This module is the single source for the key strings (the mock's
 * dead-data anchors were removed with the extraction pipeline, D45).
 *
 * extracted from pkg/panel-layout/mock/editor-dockview7-floats.html
 * @ 94d4b8307e5f0db2a1b32e14ceb8754207a51f27
 */
import type { StorageFormat } from '@metanorma/panel-layout';

/** Demo layout key (the mock's historical `LS_KEY`). */
export const DEMO_LAYOUT_KEY = 'mn-dockview7-floats-v1';

/** Demo heights key (the mock's historical `LS_H_KEY`). */
export const DEMO_HEIGHTS_KEY = 'mn-dockview7-heights-v1';

/** The demo's two-key storage format (§2.6). */
export const demoStorageFormat: StorageFormat = {
  kind: 'two-key',
  keys: { layout: DEMO_LAYOUT_KEY, heights: DEMO_HEIGHTS_KEY },
};
